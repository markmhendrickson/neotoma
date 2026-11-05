/** Copy that remains in the live install shell. Complete effects live in docs/topics/install/system-changes.md. */
export interface InstallPageStrings {
  title: string;
  fewMinutesIntegration: string;
  manualInstallAndDocker: string;
  manualInstallLinkLabel: string;
  dockerLinkLabel: string;
  cliReferenceLinkLabel: string;
  /** Older locale overlays may still carry unused fields; the live body reads only the keys above. */
  [legacyKey: string]: unknown;
}

export const INSTALL_PAGE_EN: InstallPageStrings = {
  title: "Install options",
  fewMinutesIntegration: "Takes a few minutes",
  manualInstallAndDocker: "Manual install and Docker",
  manualInstallLinkLabel: "Manual install",
  dockerLinkLabel: "Docker",
  cliReferenceLinkLabel: "CLI reference",
};

export const INSTALL_PAGE_ES: Partial<InstallPageStrings> = {
  title: "Opciones de instalación",
  fewMinutesIntegration: "Integración en unos minutos",
  manualInstallAndDocker: "Instalación manual y Docker",
  manualInstallLinkLabel: "Instalación manual",
  dockerLinkLabel: "Docker",
  cliReferenceLinkLabel: "Referencia CLI",
};
