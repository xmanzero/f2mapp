import data from "./data/parts.json";
import type { Cpu, Gpu } from "./types";

/** Danh mục sinh bởi tools/build_parts.py — sửa ở script đó, không sửa tay parts.json */
export const SCALE_VERSION: string = data.scaleVersion;
export const CPUS = data.cpus as Cpu[];
export const GPUS = data.gpus as Gpu[];

export const findCpu = (name: string): Cpu | undefined => CPUS.find((c) => c.name === name);
export const findGpu = (name: string): Gpu | undefined => GPUS.find((g) => g.name === name);

export const ANCHOR_CPU = "Core i5-12400F";
export const ANCHOR_GPU = "RTX 3060 12GB";
