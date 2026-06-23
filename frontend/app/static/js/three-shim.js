export * from "three-real";

// Compatibility alias for MindAR with modern Three.js.
// MindAR expects the old export name `sRGBEncoding`.
// Newer Three.js exports `SRGBColorSpace` instead.
export { SRGBColorSpace as sRGBEncoding } from "three-real";
