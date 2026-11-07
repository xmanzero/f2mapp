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
    run(ssh, f"cd {REMOTE} && (grep -q '^AUTH_PEPPER=' .env || echo AUTH_PEPPER=$(openssl rand -hex 32) >> .env)")

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
