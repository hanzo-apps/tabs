/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // A terminal workspace is one page and one marketing page; nothing here needs
  // a server at request time except the session read, which the browser does.
  output: 'standalone',
};
