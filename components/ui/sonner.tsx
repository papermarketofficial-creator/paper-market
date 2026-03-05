import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { theme = "system", resolvedTheme } = useTheme();
  const activeTheme = resolvedTheme || (theme === "system" ? "light" : theme);
  const invertedTheme = activeTheme === "dark" ? "light" : "dark";
  const useDarkToast = activeTheme === "light";

  const toastClassName = useDarkToast
    ? "group toast group-[.toaster]:bg-slate-900 group-[.toaster]:text-slate-100 group-[.toaster]:border-slate-700 group-[.toaster]:shadow-xl"
    : "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-xl";
  const descriptionClassName = useDarkToast
    ? "group-[.toast]:text-slate-300"
    : "group-[.toast]:text-slate-600";
  const actionButtonClassName = useDarkToast
    ? "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-900"
    : "group-[.toast]:bg-slate-900 group-[.toast]:text-slate-100";
  const cancelButtonClassName = useDarkToast
    ? "group-[.toast]:bg-slate-700 group-[.toast]:text-slate-100"
    : "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-700";

  return (
    <Sonner
      theme={invertedTheme as ToasterProps["theme"]}
      position={position ?? "top-right"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: toastClassName,
          description: descriptionClassName,
          actionButton: actionButtonClassName,
          cancelButton: cancelButtonClassName,
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
