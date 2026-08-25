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
  // @hanzo/ui renders through @hanzo/gui, which is React Native's component
  // model. On web `react-native` IS `react-native-web`, and the packages that
  // reach for the former (@hanzogui/sheet, the icon set's svg backend) resolve
  // to real React Native without this — a Flow-typed source webpack cannot
  // parse. The `.web.*` extensions are the other half: a package that ships a
  // web variant beside its native one is asking to be chosen by extension.
  //
  // react-native is pinned to 0.83 for a reason that is not cosmetic: 0.84
  // renamed `@react-native/assets-registry` to `@react-native/asset-utils`, and
  // react-native-svg 15 — which the gui icon set pulls in — still imports the
  // old name. The pair does not resolve, and the build stops.
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, 'react-native$': 'react-native-web' };
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      ...config.resolve.extensions,
    ];
    return config;
  },
};
