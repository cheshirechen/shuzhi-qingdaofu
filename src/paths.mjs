export const BASE_PATH = import.meta.env.BASE_URL;
export function assetUrl(path) {
  return new URL(path.replace(/^\//,''),new URL(BASE_PATH,self.location.origin)).href;
}
