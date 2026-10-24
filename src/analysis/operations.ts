import { tangent } from './derivative.ts'
import { findExtrema } from './extrema.ts'
import { integrate } from './integral.ts'
import { findIntersections } from './intersections.ts'
import { findRoots } from './roots.ts'

/**
 * Numerical analysis operations behind the Inspector. Loaded on demand so
 * Graph Studio starts without root/extrema/integral/tangent/intersection
 * code; overlay state stays in the eager hook and is populated only after
 * the user runs a tool.
 */
export { findExtrema, findIntersections, findRoots, integrate, tangent }
