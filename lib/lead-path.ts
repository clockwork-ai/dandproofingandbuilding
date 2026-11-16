/**
 * Chat enquiries are stored as one private JSON object per save:
 * <storagePrefix>/<YYYY-MM-DD>/<16 hex chars>.json
 * storagePrefix is business.lead.storagePrefix, a single folder name.
 * The cleanup may delete an object only when the pathname matches this shape.
 */

const FOLDER = /^[a-z0-9][a-z0-9_-]*$/;
const OBJECT = /^(\d{4}-\d{2}-\d{2})\/([a-f0-9]{16})\.json$/;

export function leadFolderPrefix(storagePrefix: string): string {
  if (!FOLDER.test(storagePrefix)) {
    throw new Error("lead storage prefix must be one folder name");
  }
  return `${storagePrefix}/`;
}

export function isLeadObjectPath(pathname: string, storagePrefix: string): boolean {
  if (!FOLDER.test(storagePrefix)) return false;
  const prefix = `${storagePrefix}/`;
  if (!pathname.startsWith(prefix)) return false;
  return OBJECT.test(pathname.slice(prefix.length));
}

export function leadObjectPath(storagePrefix: string, day: string, hash: string): string {
  const pathname = `${leadFolderPrefix(storagePrefix)}${day}/${hash}.json`;
  if (!isLeadObjectPath(pathname, storagePrefix)) {
    throw new Error("lead object path is not valid");
  }
  return pathname;
}
