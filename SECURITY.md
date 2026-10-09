# Security Policy

## Reporting a vulnerability

Please do not open a public issue, pull request, or discussion for a security vulnerability.

Report it privately through GitHub's private vulnerability reporting:

https://github.com/nick-vogel/payload-storage-cloudinary/security/advisories/new

Include the plugin version, your Payload version and database adapter, the plugin configuration for the affected collection, and the steps to reproduce. A proof of concept helps, but it is not required.

## What to expect

- I acknowledge your report within 7 days.
- I confirm or rule out the issue, and share a plan for a fix, within 30 days.
- I keep the advisory private until a fixed version is on npm, then publish it and credit you, unless you ask not to be credited.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

Security fixes ship as a new 1.x release. Upgrade to the latest 1.x to get them.

## Scope

In scope:

- The `payload-storage-cloudinary` package published on npm, including its server and client entry points.
- Access control and authorization in the plugin's endpoints and generated URLs.
- Exposure of Cloudinary credentials or of assets that the plugin configuration marks as private.

Out of scope:

- Vulnerabilities in Payload CMS itself. Report those to Payload.
- Vulnerabilities in Cloudinary's service or SDK. Report those to Cloudinary.
- The `dev/` test application in this repository.
- Issues that need an attacker to already hold your Cloudinary API secret or Payload admin access.
