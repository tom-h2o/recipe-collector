// exifr's lite build (JPEG and HEIF, no PNG/XMP/ICC) has no declaration of
// its own; it exposes the same API as the package's main entry.
declare module 'exifr/dist/lite.esm.mjs' {
  import exifr from 'exifr';
  export default exifr;
}
