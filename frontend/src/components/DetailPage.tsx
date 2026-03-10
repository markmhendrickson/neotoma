import React from "react";
import { useLocation } from "react-router-dom";
import { SeoHead } from "./SeoHead";

interface DetailPageProps {
  title: string;
  children: React.ReactNode;
}

export function DetailPage({ title, children }: DetailPageProps) {
  const { pathname } = useLocation();
  return (
    <>
      <SeoHead routePath={pathname} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-6">{title}</h1>
          <div className="post-prose [&_a]:underline [&_a]:hover:text-foreground">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
