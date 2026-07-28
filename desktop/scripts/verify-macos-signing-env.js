"use strict";

const requiredSigning = ["CSC_LINK", "CSC_KEY_PASSWORD"];
const appleIdCredentials = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const apiKeyCredentials = [
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

function missing(names) {
  return names.filter((name) => !String(process.env[name] || "").trim());
}

const missingSigning = missing(requiredSigning);
const hasAppleIdCredentials = missing(appleIdCredentials).length === 0;
const hasApiKeyCredentials = missing(apiKeyCredentials).length === 0;

if (
  missingSigning.length > 0 ||
  (!hasAppleIdCredentials && !hasApiKeyCredentials)
) {
  if (missingSigning.length > 0) {
    console.error(
      `Missing macOS signing variables: ${missingSigning.join(", ")}`,
    );
  }
  if (!hasAppleIdCredentials && !hasApiKeyCredentials) {
    console.error(
      "Configure either APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID " +
        "or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER.",
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `macOS signing environment is configured (${hasApiKeyCredentials ? "App Store Connect API key" : "Apple ID"} notarization).`,
  );
}
