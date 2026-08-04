/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // A STATIC EXPORT. Tabs has no backend by design: it reads the control plane
  // from the browser with the caller's own IAM token and frames terminals the
  // machines themselves serve. With nothing to run at request time, a server
  // would only be something else to keep up.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
