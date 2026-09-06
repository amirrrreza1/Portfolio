import { permanentRedirect } from "next/navigation";

export default function RootPage(): never {
  // The proxy negotiates a visitor's locale. This fallback keeps direct page
  // execution and prerendering from treating `/` as a second home route.
  permanentRedirect("/en");
}
