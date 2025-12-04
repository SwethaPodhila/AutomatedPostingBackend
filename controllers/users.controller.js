import jwtDecode from "jwt-decode";

export default function FacebookConnect() {
  const BACKEND_URL = "https://automatedpostingbackend.onrender.com";

  const connectFacebook = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login first!");
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      console.log("DECODED TOKEN:", decoded);
    } catch (error) {
      console.error("Invalid token:", error);
      alert("Invalid token. Please login again.");
      return;
    }

    const userId = decoded.id; // <-- THIS IS CORRECT

    if (!userId) {
      alert("User ID not found in token!");
      return;
    }

    window.location.href = `${BACKEND_URL}/social/facebook?userId=${userId}`;
  };

  return (
    <button
      onClick={connectFacebook}
      style={{
        padding: "12px 25px",
        backgroundColor: "#1877F2",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "16px",
        marginTop: "20px",
      }}
    >
      Connect with Facebook
    </button>
  );
}
