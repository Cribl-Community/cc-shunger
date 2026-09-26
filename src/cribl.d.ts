// Globals injected by the Cribl App platform. Read-only; never assign them.
interface CriblUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  initials?: string;
}

interface Window {
  readonly CRIBL_API_URL: string;
  readonly CRIBL_BASE_PATH: string;
  readonly getCriblUser: () => Promise<CriblUser>;
}
