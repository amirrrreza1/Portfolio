"use client";

import React from "react";

export const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-bold">{children}</span>
);

export const I: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="italic">{children}</span>
);