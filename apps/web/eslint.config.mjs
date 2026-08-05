import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: [".next/**", "out/**", "dist/**", "next-env.d.ts"],
  },
  {
    files: [
      "src/Components/Layout/Header/Header.tsx",
      "src/Components/UI/Custom/Select.tsx",
      "src/Components/UI/Tooltip/Tooltip.tsx",
      "src/app/(Other Pages)/projects/page.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["src/Contexts/ThemeContext.tsx"],
    rules: {
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
