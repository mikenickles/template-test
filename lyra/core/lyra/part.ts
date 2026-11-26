import type { Lyra } from "../lyra.ts";

/**
 * A group of Lyra's methods kept in its own file. Inside, `this` is the Lyra instance; lyra.ts copies
 * every part onto Lyra.prototype, so callers use lyra.method() as usual. Give each method a return type:
 * the parts' types make up the Lyra interface, so an inferred one can loop back on itself.
 */
export function part<T>(methods: T & ThisType<Lyra>): T {
  return methods;
}

/** Puts the parts' methods and getters onto the class, like ones written in it (not enumerable). */
export function install(target: object, parts: object[]): void {
  for (const p of parts)
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(p))) {
      if (Object.prototype.hasOwnProperty.call(target, k)) throw new Error(`Lyra.${k} is defined twice`);
      Object.defineProperty(target, k, { ...d, enumerable: false });
    }
}
