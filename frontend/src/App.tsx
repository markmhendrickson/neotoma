import { MainApp } from "@/components/MainApp";
import { Toaster } from "@/components/ui/toaster";

function App() {
  // Public site-only frontend flow.
  return (
    <>
      <MainApp />
      <Toaster />
    </>
  );
}

export default App;
