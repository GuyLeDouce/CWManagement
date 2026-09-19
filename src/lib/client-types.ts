import type { state, myHours, locate, managementOptions, info } from './queries';
import type { adminData } from './admin';
import type { visits } from './visits';
import type { getRecords } from './reports';
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type State = Serialized<Awaited<ReturnType<typeof state>>>;
export type Hours = Serialized<Awaited<ReturnType<typeof myHours>>>;
export type Locations = Serialized<Awaited<ReturnType<typeof locate>>>;
export type Options = Serialized<Awaited<ReturnType<typeof managementOptions>>>;
export type Info = Serialized<Awaited<ReturnType<typeof info>>>;
export type AdminData = Serialized<Awaited<ReturnType<typeof adminData>>>;
export type Visits = Serialized<Awaited<ReturnType<typeof visits>>>;
export type RecordRow = Serialized<Awaited<ReturnType<typeof getRecords>>>[number];
