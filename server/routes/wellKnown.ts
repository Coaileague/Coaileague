import { Router } from "express";

const wellKnownRouter = Router();

wellKnownRouter.get("/.well-known/assetlinks.json", (_req, res) => {
  const fingerprint = process.env.TWA_SHA256_FINGERPRINT || "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

  const assetLinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.coaileague.app",
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ];

  res.setHeader("Content-Type", "application/json");
  res.json(assetLinks);
});

export default wellKnownRouter;
