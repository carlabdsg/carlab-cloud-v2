
// ===== CARLAB MODO APP =====

let view = 'home';
let agenda = [];

function setView(v){
  view = v;
  render();
}

async function loadAgenda(){
  const res = await fetch('/api/schedules');
  agenda = await res.json();
}

async function programarUnidad(tel, folio){
  await fetch('/api/programar',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({telefono:tel, folio})
  });
  alert('Solicitud enviada');
}

function render(){
  const app = document.getElementById('app');

  if(view === 'home'){
    app.innerHTML = `
      <h2>Inicio</h2>
      <p>Citas hoy: ${agenda.length}</p>
    `;
  }

  if(view === 'nuevo'){
    app.innerHTML = `
      <h2>Nuevo reporte</h2>
      <input type="file" multiple id="fotos"><br><br>
      <button onclick="alert('Reporte guardado')">Guardar</button>
    `;
  }

  if(view === 'agenda'){
    app.innerHTML = `
      <h2>Agenda</h2>
      <button onclick="loadAgenda().then(render)">Actualizar</button>
      ${agenda.map(a=>`<div>${a.fecha||'-'} ${a.hora||'-'}</div>`).join('')}
    `;
  }

  if(view === 'reportes'){
    app.innerHTML = `
      <h2>Mis reportes</h2>
      <p>Lista aquí</p>
    `;
  }
}

window.onload = async ()=>{
  await loadAgenda();
  render();
}
