# Deployment on Ash

The authoritative checkout is `/home/tc/gcdgraph` on Ash (Ubuntu WSL, SSH port 2222). The static site at https://gcd.by.tc serves its `dist/` directory. Existing configuration, source, dependencies, and the published build were preserved during the October 10, 2026 migration.

Build and publish from this checkout on Ash with `npm run build`; use `npm ci` first when dependencies need installation. A build in the retained Phoenix copy no longer changes the public site. There is no deployment CI or application backend.

During migration Phoenix retains public HTTPS and certificate renewal and proxies this site to Ash port 18081. `deploy/gcd.by.tc.migration.conf` is Ash's current vhost; `deploy/gcd.by.tc.conf` preserves the full HTTPS configuration for the later gateway handoff. Validate nginx before reloading it. The normal Ash static-site backup includes this source and published build.
