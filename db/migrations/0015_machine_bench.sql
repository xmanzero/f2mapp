-- Đo hiệu năng thật bằng Blender Benchmark (pcdex-scan "Đo hiệu năng"): kết quả của lần gắn mã gần nhất có đo.
-- Dạng BenchResult (packages/shared/src/scan.ts) + "at": thời điểm gắn. Số đo của CPU / card đã thay thì không hiện nữa (benchForSpec).
alter table machines add column bench jsonb;
