"use client";

import React from "react";

export const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-bold">{children}</span>
);

export const I: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="italic">{children}</span>
);

export const U: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="underline">{children}</span>
);

export const C: React.FC<{ color: string; children: React.ReactNode }> = ({
  color,
  children,
}) => <span style={{ color }}>{children}</span>;