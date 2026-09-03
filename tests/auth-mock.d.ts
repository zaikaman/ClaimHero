declare module "@convex-dev/auth/server" {
  export function getAuthUserId(...args: any[]): Promise<any>;
  export function convexAuth(...args: any[]): any;
}
