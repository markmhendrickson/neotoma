import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainApp } from "@/components/MainApp";

function App() {
  return (
    <ProtectedRoute>
      <MainApp />
    </ProtectedRoute>
  );
}

export default App;
