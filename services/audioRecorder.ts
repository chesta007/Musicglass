
export async function getAudioStream(): Promise<MediaStream> {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
  
  if (!window.isSecureContext && !isLocal) {
    throw new Error("El micrófono requiere HTTPS. Asegúrate de que la URL empiece por https://");
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Tu navegador bloquea el acceso al micrófono. Prueba en Chrome o Safari.");
  }

  try {
    // Solicitud minimalista para evitar fallos por constraints incompatibles
    return await navigator.mediaDevices.getUserMedia({ 
      audio: true 
    });
  } catch (err: any) {
    console.error("Mic error:", err.name);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
      throw new Error("Permiso denegado. Entra en Ajustes -> Aplicaciones -> [Navegador] -> Permisos -> Activar Micrófono.");
    }
    throw new Error("Micro bloqueado: " + err.message);
  }
}

export function getSupportedMimeType(): string {
  const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', ''];
  for (const type of types) {
    if (type === '' || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type))) {
      return type;
    }
  }
  return '';
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) {
        resolve(result.split(',')[1]);
      } else {
        reject(new Error("Error conversion"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
