// Node module hooks: run erp/js/sop/data.js (browser ESM) under Node against the Firestore emulator.
// - CDN firebase imports -> local "firebase/firestore"
// - ../auth.js / ../cloudinary-config.js -> per-user stubs (the ?u=<uid> query selects which test user's db)
const HERE = new URL('./', import.meta.url);
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://www.gstatic.com/firebasejs/')) {
    const mod = specifier.split('/').pop().replace('.js', '').replace('firebase-', '');
    return next(`firebase/${mod}`, { ...context, parentURL: HERE.href });
  }
  const parent = context.parentURL ? new URL(context.parentURL) : null;
  if (parent && parent.pathname.endsWith('/js/sop/data.js')) {
    if (specifier === '../auth.js') return { url: new URL('stub-auth.mjs' + parent.search, HERE).href, shortCircuit: true };
    if (specifier === '../cloudinary-config.js') return { url: new URL('stub-cloud.mjs', HERE).href, shortCircuit: true };
  }
  return next(specifier, context);
}
