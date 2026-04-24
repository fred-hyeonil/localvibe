import { googleLogout } from "@react-oauth/google";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function StartNavbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("lv_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const syncUser = () => {
      try {
        const raw = localStorage.getItem("lv_user");
        setUser(raw ? JSON.parse(raw) : null);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", syncUser);
    window.addEventListener("lv-auth-changed", syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("lv-auth-changed", syncUser);
    };
  }, []);

  return (
    <div style={styles.nav}>
      <h1 style={styles.logo} onClick={() => navigate("/")}>
        LocalVibe
      </h1>

      <div style={styles.right}>
        {user ? (
          <>
            <div style={styles.profileWrap}>
              {user.picture ? (
                <img src={user.picture} alt="profile" style={styles.avatar} />
              ) : (
                <div style={styles.avatarFallback}>
                  {String(user.name || user.email || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
              <span style={styles.profileName}>{user.name || user.email}</span>
            </div>
            <button
              style={styles.btn}
              onClick={() => {
                googleLogout();
                localStorage.removeItem("lv_access_token");
                localStorage.removeItem("lv_user");
                window.dispatchEvent(new Event("lv-auth-changed"));
                navigate("/login");
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <button style={styles.btn} onClick={() => navigate("/login")}>
              Login
            </button>
            <button style={styles.btn} onClick={() => navigate("/signin")}>
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  nav: {
    maxWidth: "1400px",
    width: "90%",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 0",
    borderBottom: "1px solid #eee",
    flexWrap: "wrap",
  },
  logo: {
    fontSize: "clamp(26px,3vw,46px)",
    fontWeight: "800",
    cursor: "pointer",
    margin: 0,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  profileWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    maxWidth: "240px",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    objectFit: "cover",
    border: "1px solid #ddd",
  },
  avatarFallback: {
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    background: "#ddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "14px",
    color: "#333",
  },
  profileName: {
    fontSize: "14px",
    color: "#222",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  btn: {
    padding: "10px 18px",
    fontSize: "clamp(14px,1.2vw,20px)",
    borderRadius: "10px",
    cursor: "pointer",
    border: "none",
    background: "#000",
    color: "#fff",
  },
};
