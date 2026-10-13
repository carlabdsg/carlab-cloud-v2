/* Additive account controls for the external AC role; legacy user handlers stay in place. */
(() => {
  const api = async (path, options = {}) => {
    const r = await fetch("/api/ac" + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + localStorage.getItem("carlabToken"),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo guardar el acceso.");
    return j;
  };
  function mount() {
    const form = document.getElementById("userForm"),
      role = document.getElementById("userRole");
    if (!form || !role) return;
    const option = document.createElement("option");
    option.value = "supervisor_ac";
    option.textContent = "Supervisor AC";
    role.append(option);
    const block = document.createElement("div");
    block.hidden = true;
    block.id = "ac-main-brand-block";
    block.innerHTML =
      '<label>Empresa / marca Supervisor AC</label><select id="ac-main-user-brand"><option value="">Seleccionar marca</option><option value="hispacold">Hispacold</option><option value="eberspaecher">Eberspächer</option></select><p style="font-size:12px;color:#657781">Acceso externo: solicita servicios y consulta únicamente su marca.</p>';
    role.parentElement.insertAdjacentElement("afterend", block);
    const feedback = document.createElement("p");
    feedback.id = "ac-main-user-feedback";
    feedback.setAttribute("role", "status");
    form.append(feedback);
    let loadedId = "";
    const sync = () => {
      const ac = role.value === "supervisor_ac";
      block.hidden = !ac;
      document.getElementById("ac-main-user-brand").required = ac;
      const company = document.getElementById("userEmpresa");
      if (company) {
        company.parentElement.hidden = ac;
        if (ac) company.disabled = true;
      }
      const id = document.getElementById("userId").value;
      if (ac && id && id !== loadedId) {
        loadedId = id;
        api("/users")
          .then((users) => {
            if (document.getElementById("userId").value !== id) return;
            const u = users.find((u) => u.id === id);
            if (u)
              document.getElementById("ac-main-user-brand").value =
                u.empresa === "Hispacold" ? "hispacold" : "eberspaecher";
          })
          .catch((e) => (feedback.textContent = e.message));
      }
      if (!id) loadedId = "";
    };
    role.addEventListener("change", sync);
    document.addEventListener("click", () => queueMicrotask(sync));
    form.addEventListener(
      "submit",
      async (e) => {
        if (role.value !== "supervisor_ac") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!form.reportValidity()) return;
        const get = (id) => document.getElementById(id).value.trim(),
          id = get("userId"),
          body = {
            nombre: get("userNombre"),
            email: get("userEmail"),
            telefono: get("userTelefono"),
            password: document.getElementById("userPassword").value,
            brand: get("ac-main-user-brand"),
          };
        const submit = document.getElementById("userSubmitBtn");
        submit.disabled = true;
        feedback.textContent = "Guardando acceso…";
        try {
          await api("/users" + (id ? "/" + id : ""), {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(body),
          });
          document.getElementById("userCancelEditBtn").click();
          document.getElementById("navUsersBtn").click();
          feedback.textContent = "Usuario Supervisor AC guardado.";
          sync();
        } catch (err) {
          feedback.textContent = err.message;
        } finally {
          submit.disabled = false;
        }
      },
      true,
    );
    const list = document.getElementById("usersList");
    if (list)
      new MutationObserver(() => {
        const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode()))
          if (node.textContent.trim() === "supervisor_ac")
            node.textContent = "Supervisor AC";
      }).observe(list, { childList: true, subtree: true });
    sync();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
