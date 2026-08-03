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

declare namespace App {
  interface Locals {
    user?: User;
    wpToken?: string | null;
    wpUserId?: number | null;
  }
}
