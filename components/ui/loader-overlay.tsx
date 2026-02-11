import Spinner from "./spinner";

export default function LoaderOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <Spinner size={42} />
    </div>
  );
}
