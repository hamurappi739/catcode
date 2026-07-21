"use strict";

const SSL_URL_PARAMETERS = ["sslmode", "sslcert", "sslkey", "sslrootcert"];

function removeSslUrlParameters(databaseUrl) {
  const url = new URL(databaseUrl);
  for (const name of SSL_URL_PARAMETERS) url.searchParams.delete(name);
  return url.toString();
}

function databasePoolOptions({ databaseUrl, databaseSsl, databaseCaCertPem = null }) {
  const options = { connectionString: removeSslUrlParameters(databaseUrl) };
  if (!databaseSsl) return { ...options, ssl: false };

  options.ssl = { rejectUnauthorized: true };
  if (databaseCaCertPem) options.ssl.ca = databaseCaCertPem;
  return options;
}

module.exports = { databasePoolOptions };
