import { memoryStorage, Options } from 'multer';

type MulterLimits = NonNullable<Options['limits']> & {
  fieldNestingDepth?: number;
};

function createUploadOptions(limits: MulterLimits): Options {
  return {
    storage: memoryStorage(),
    limits,
  };
}

export const imageUploadOptions = createUploadOptions({
  fileSize: 10 * 1024 * 1024,
  fieldNestingDepth: 3,
  fields: 10,
  files: 6,
});

export const jpegImageUploadOptions = createUploadOptions({
  fileSize: 10 * 1024 * 1024,
  fieldNestingDepth: 3,
  fields: 10,
  files: 6,
});

export const adminObjectUploadOptions = createUploadOptions({
  fileSize: 50 * 1024 * 1024,
  fieldNestingDepth: 3,
  fields: 10,
  files: 2,
});
