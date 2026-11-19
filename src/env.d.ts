/// <reference types="astro/client" />

declare module "virtual:icons/*" {
  import type { SVGProps } from "react";
  const component: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  export default component;
}

interface User {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

interface Window {
  /** Site-wide Lenis instance (null when skipped under reduced motion). */
  __lenis?: import("lenis").default | null;
}

declare namespace App {
  interface Locals {
    user?: User;
    wpToken?: string | null;
    wpUserId?: number | null;
  }
}
