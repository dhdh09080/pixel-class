type Env = Record<string, string | undefined>;
export function isRailway(env: Env): boolean;
export function hasMount(info: string, target: string): boolean;
export function prepareVolumePermissions(env: Env): void;
export function admitRailwayDatabase(env: Env): void;
