import { useNavigate } from "react-router-dom";

export default function StartNavbar() {
  const navigate = useNavigate();

  return (
    <div style={styles.nav}>
      <h1 style={styles.logo} onClick={() => navigate("/")}>
        LocalVibe
      </h1>

      <div style={styles.right}>
        <button style={styles.btnOutline} onClick={() => navigate("/login")}>
          로그인
        </button>
        <button style={styles.btnFilled} onClick={() => navigate("/signin")}>
          회원가입
        </button>
      </div>
    </div>
  );
}

const styles = {
  nav: {
    maxWidth: "100%",
    width: "100%",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 5%",
    flexWrap: "wrap",
    borderBottom: "1px solid #e8ddd5",
    backgroundColor: "#FAF8F5",
  },
  logo: {
    fontSize: "clamp(20px, 2.5vw, 26px)",
    fontWeight: "800",
    cursor: "pointer",
    margin: 0,
    color: "#1a0e08",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    letterSpacing: "-0.5px",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  btnOutline: {
    padding: "9px 20px",
    fontSize: "14px",
    fontWeight: "600",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "8px",
    cursor: "pointer",
    border: "1.5px solid #e8ddd5",
    background: "transparent",
    color: "#5a4a3e",
    transition: "all 0.15s",
  },
  btnFilled: {
    padding: "9px 20px",
    fontSize: "14px",
    fontWeight: "700",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "8px",
    cursor: "pointer",
    border: "none",
    background: "#E8824A",
    color: "#fff",
    transition: "all 0.15s",
  },
};
