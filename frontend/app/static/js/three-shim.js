export * from "three-real";

// Compatibility alias for MindAR.
// MindAR imports old Three.js name: sRGBEncoding.
// New Three.js exports: SRGBColorSpace.
export { SRGBColorSpace as sRGBEncoding } from "three-real";

