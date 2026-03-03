# macOS VM Testing with UTM

For macOS-specific testing, UTM is a practical option for running disposable macOS VMs locally.
It is useful for validating setup docs, OAuth/browser behavior, and clean-environment onboarding.

- UTM project: `https://mac.getutm.app/`
- Typical workflow: create VM, SSH into it, clone Neotoma, run the same dev/test commands used on host.

## Suggested VM smoke flow

1. Provision a fresh macOS VM in UTM.
2. Enable remote login (SSH) in VM settings.
3. SSH into the VM and clone the Neotoma repository.
4. Install dependencies and run baseline checks (`npm run build:server`, `npm test` as needed).
5. Validate local API and MCP setup from a clean machine context.

## Notes

- Keep VM test data isolated from host data directories.
- Prefer snapshotting a known-good VM state to speed up repeated test passes.
