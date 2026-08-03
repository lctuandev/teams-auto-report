"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      duration={4000}
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !pr-12 font-sans",
          title: "font-semibold",
          description: "text-muted-foreground",
          closeButton: "toast-close-button-inside",
        },
      }}
      {...props}
    />
  );
}
