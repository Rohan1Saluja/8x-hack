import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger" | "text";
  size?: "default" | "compact" | "small";
};

const variants = {
  primary: "border-transparent bg-purple text-white",
  secondary: "border-line bg-white text-ink",
  danger: "border-transparent bg-[#a63535] text-white",
  text: "border-transparent bg-transparent px-0 py-[5px] text-[11px] text-muted",
};

const sizes = {
  default: "px-[18px] py-[11px]",
  compact: "px-[11px] py-2 text-[11px]",
  small: "px-2.5 py-[7px] text-[11px]",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer touch-manipulation items-center justify-center gap-6 rounded-lg border font-semibold focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] enabled:hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-48 ${variants[variant]} ${variant === "text" ? "" : sizes[size]} ${className}`}
      {...props}
    />
  );
}
