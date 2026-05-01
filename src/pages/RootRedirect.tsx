import { Navigate } from "react-router-dom";

export default function RootRedirect() {
  // Generate is the default landing for everyone.
  return <Navigate to="/generate" replace />;
}
