# Fork-local delivery policy for generated offline artifacts.
location = /service-worker.js {
  add_header Cache-Control "no-store, no-cache, must-revalidate" always;
  add_header Pragma "no-cache" always;
  add_header Expires "0" always;
  add_header Service-Worker-Allowed "/" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  try_files $uri =404;
}

location = /offline.webmanifest {
  default_type application/manifest+json;
  add_header Cache-Control "no-cache, must-revalidate" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  try_files $uri =404;
}
