"""Deploy f2m lên aicenter (192.168.110.136) bằng Docker Compose.

Dùng: DEPLOY_PASS=<mật khẩu agentws> python deploy/deploy.py [api|web|all]
  - Đóng gói mã nguồn cần thiết (bỏ node_modules, .next…), gửi lên ~/f2mapp/src.
  - Lần đầu tạo ~/f2mapp/.env với mật khẩu Postgres ngẫu nhiên (giữ nguyên các lần sau).
  - docker compose up -d --build cho dịch vụ được chọn, rồi kiểm tra /health.
"""
import io, os, sys, tarfile, time
from pathlib import Path

import paramiko

HOST, USER = "192.168.110.136", "agentws"
REMOTE = "/home/agentws/f2mapp"
ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["package.json", "package-lock.json", "tsconfig.base.json", "packages/shared", "apps/api", "apps/web",
           "apps/mobile/package.json", "db", "deploy"]
SKIP_DIRS = {"node_modules", ".next", ".expo", "dist", "build", "__pycache__", ".turbo"}
SKIP_FILES = {".env"}

sys.stdout.reconfigure(encoding="utf-8")


SCANNER_OUT = ROOT / "apps/web/public/tai/pcdex-scan.exe"


def build_scanner():
    """Build phần mềm quét Windows (tools/pcdex-scan) rồi đặt vào web: /tai/pcdex-scan.exe. Không có .NET SDK thì giữ bản cũ."""
    import shutil, subprocess, tempfile
    if not shutil.which("dotnet"):
        print("Không có .NET SDK: giữ nguyên pcdex-scan.exe cũ" if SCANNER_OUT.exists() else "Không có .NET SDK: web chưa có pcdex-scan.exe")
        return
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["dotnet", "build", str(ROOT / "tools/pcdex-scan"), "-c", "Release", "-o", tmp, "-nologo", "-v", "q"], check=True)
        exe = Path(tmp) / "pcdex-scan.exe"
        signed = sign_exe(exe)
        SCANNER_OUT.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(exe, SCANNER_OUT)
    import hashlib
    digest = hashlib.sha256(SCANNER_OUT.read_bytes()).hexdigest()
    # mã băm công khai để người dùng tự kiểm tra tệp tải về (Get-FileHash pcdex-scan.exe)
    SCANNER_OUT.with_name("pcdex-scan.exe.sha256").write_text(f"{digest}  pcdex-scan.exe\n", encoding="ascii")
    print(f"pcdex-scan.exe: {SCANNER_OUT.stat().st_size / 1024:.0f} KB · {'đã ký' if signed else 'CHƯA KÝ'} · sha256 {digest[:16]}…")


def find_signtool():
    import glob, shutil
    if shutil.which("signtool"):
        return shutil.which("signtool")
    found = sorted(glob.glob(r"C:\Program Files (x86)\Windows Kits\10\bin\10.*\x64\signtool.exe"))
    return found[-1] if found else None


def sign_exe(exe: Path) -> bool:
    """
    Ký số Authenticode cho pcdex-scan.exe nếu đã cấu hình (biến môi trường, không lưu trong repo):
      - PCDEX_SIGN_THUMBPRINT: chứng chỉ trong kho Windows (CurrentUser\\My) — thẻ USB, Certum SimplySign…
      - PCDEX_SIGN_PFX (+ PCDEX_SIGN_PFX_PASS): tệp .pfx
      - PCDEX_SIGN_DLIB + PCDEX_SIGN_METADATA: Azure Trusted Signing (Azure.CodeSigning.Dlib.dll + metadata.json)
      - PCDEX_SIGN_TIMESTAMP: máy chủ đóng dấu thời gian (mặc định theo kiểu ký)
    Chưa cấu hình → không ký (in cảnh báo). Đã cấu hình mà ký / kiểm tra lỗi → dừng deploy, không phát hành bản chưa ký.
    """
    import subprocess
    env = os.environ
    thumb, pfx, dlib = env.get("PCDEX_SIGN_THUMBPRINT"), env.get("PCDEX_SIGN_PFX"), env.get("PCDEX_SIGN_DLIB")
    if not (thumb or pfx or dlib):
        print("Chưa cấu hình ký số (PCDEX_SIGN_*): pcdex-scan.exe phát hành chưa ký")
        return False
    tool = find_signtool()
    if not tool:
        sys.exit("Đã cấu hình ký số nhưng không tìm thấy signtool.exe (cài Windows SDK)")
    ts = env.get("PCDEX_SIGN_TIMESTAMP") or ("http://timestamp.acs.microsoft.com" if dlib else "http://timestamp.digicert.com")
    cmd = [tool, "sign", "/fd", "sha256", "/tr", ts, "/td", "sha256", "/d", "pcdex-scan", "/du", "https://pcdex.app"]
    if dlib:
        cmd += ["/dlib", dlib, "/dmdf", env["PCDEX_SIGN_METADATA"]]
    elif pfx:
        cmd += ["/f", pfx] + (["/p", env["PCDEX_SIGN_PFX_PASS"]] if env.get("PCDEX_SIGN_PFX_PASS") else [])
    else:
        cmd += ["/sha1", thumb]
    r = subprocess.run(cmd + [str(exe)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("Ký số lỗi: " + (r.stdout + r.stderr).strip()[-400:])
    # /pa: chính sách Authenticode; chứng chỉ tự tạo (thử) không qua bước này → chỉ cảnh báo khi PCDEX_SIGN_TEST=1
    v = subprocess.run([tool, "verify", "/pa", str(exe)], capture_output=True, text=True)
    if v.returncode != 0:
        if env.get("PCDEX_SIGN_TEST") == "1":
            print("Đã ký bằng chứng chỉ thử (Windows chưa tin): " + v.stderr.strip()[-200:])
        else:
            sys.exit("Đã ký nhưng Windows không xác minh được chữ ký: " + (v.stdout + v.stderr).strip()[-400:])
    return True


def make_tarball() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        def flt(ti: tarfile.TarInfo):
            parts = Path(ti.name).parts
            if any(p in SKIP_DIRS for p in parts) or Path(ti.name).name in SKIP_FILES:
                return None
            return ti
        for item in INCLUDE:
            tar.add(ROOT / item, arcname=item, filter=flt)
    return buf.getvalue()


def run(ssh: paramiko.SSHClient, cmd: str, check=True) -> str:
    _, out, err = ssh.exec_command(cmd, get_pty=False)
    code = out.channel.recv_exit_status()
    text = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
    if check and code != 0:
        print(text)
        raise SystemExit(f"Lỗi ({code}): {cmd}")
    return text


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    services = {"api": "api", "web": "web", "all": ""}[target]
    password = os.environ.get("DEPLOY_PASS") or sys.exit("Thiếu biến môi trường DEPLOY_PASS")

    if target in ("web", "all"):
        build_scanner()
    data = make_tarball()
    print(f"Gói mã nguồn: {len(data) / 1024:.0f} KB")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, 22, USER, password, timeout=20)
    run(ssh, f"mkdir -p {REMOTE}")
    with ssh.open_sftp() as sftp:
        sftp.putfo(io.BytesIO(data), f"{REMOTE}/src.tgz")
    run(ssh, f"cd {REMOTE} && rm -rf src && mkdir src && tar xzf src.tgz -C src && rm src.tgz && cp src/deploy/docker-compose.yml .")
    # .env tạo một lần, không ghi đè; thêm biến mới nếu thiếu
    run(ssh, f"cd {REMOTE} && [ -f .env ] || (echo POSTGRES_PASSWORD=$(openssl rand -hex 16) > .env && chmod 600 .env)")

    print("Build + khởi động (lần đầu mất vài phút)…")
    out = run(ssh, f"cd {REMOTE} && docker compose up -d --build {services} 2>&1 | tail -25")
    print(out)

    for _ in range(30):
        api = run(ssh, "curl -fsS http://127.0.0.1:8140/health || true", check=False)
        web = run(ssh, "curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8141/ || true", check=False)
        if '"ok":true' in api and web.strip() == "200":
            break
        time.sleep(3)
    print("API /health:", api.strip() or "chưa phản hồi")
    print("Web /:", web.strip() or "chưa phản hồi")
    print(run(ssh, "docker ps --filter name=f2m_ --format '{{.Names}}  {{.Status}}  {{.Ports}}'", check=False))
    ssh.close()


if __name__ == "__main__":
    main()
