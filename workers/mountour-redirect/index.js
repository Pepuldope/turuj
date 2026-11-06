// Stand-alone redirect Worker for the dead old address mountour.nemcok-peter123.workers.dev (F23).
// Not part of the Next.js/OpenNext build, CI or typecheck. Deploy by hand (see wrangler.toml).
export default {
  fetch(request) {
    const { pathname, search } = new URL(request.url);
    return Response.redirect(`https://turuj.sk${pathname}${search}`, 301);
  },
};
