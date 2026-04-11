import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO } from "@/components/seo";

export default function PrivacyPolicyEs() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Política de Privacidad | CoAIleague"
        description="Política de privacidad de CoAIleague — sus derechos de privacidad y cómo manejamos sus datos."
        canonical="https://www.coaileague.com/privacy-es"
      />
      <UniversalHeader variant="public" />
      <div className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Política de Privacidad</h1>
          <p className="text-muted-foreground mb-2">Última actualización: 27 de marzo de 2026</p>
          <p className="text-muted-foreground mb-8"><a href="/privacy" className="underline">Read in English</a></p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introducción</h2>
            <p>CoAIleague ("nosotros", "nuestro") opera una plataforma de gestión de la fuerza laboral para empresas de seguridad. Esta Política de Privacidad explica cómo recopilamos, usamos, almacenamos y protegemos su información personal.</p>
            <p className="mt-2">Esta política cumple con el Reglamento General de Protección de Datos (RGPD), la Ley de Privacidad del Consumidor de California (CCPA) y las leyes de privacidad aplicables en Texas.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Información que Recopilamos</h2>
            <h3 className="text-xl font-semibold mb-2">2.1 Información personal de empleados/oficiales</h3>
            <ul>
              <li>Nombre, apellido, número de empleado</li>
              <li>Dirección de correo electrónico, número de teléfono, dirección postal</li>
              <li>Fecha de nacimiento, número de seguro social (últimos 4 dígitos)</li>
              <li>Contacto de emergencia (nombre, teléfono, relación)</li>
              <li>Información de credenciales y licencias (número de tarjeta de guardia, vencimiento)</li>
              <li>Registros de nómina y fiscales (ingresos, deducciones, formularios W-2/1099)</li>
              <li>Registros de tiempo y asistencia (entrada/salida, ubicación GPS)</li>
              <li>Historial de turnos y asignaciones de clientes</li>
            </ul>

            <h3 className="text-xl font-semibold mb-2 mt-4">2.2 Información de uso de la plataforma</h3>
            <ul>
              <li>Registros de inicio de sesión y actividad de la cuenta</li>
              <li>Registros de auditoría de acciones en la plataforma</li>
              <li>Consultas de búsqueda (anonimizadas a los 90 días)</li>
              <li>Preferencias de la interfaz de usuario</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Cómo Usamos su Información</h2>
            <ul>
              <li>Procesamiento de nómina y gestión de beneficios</li>
              <li>Programación de turnos y gestión de asistencia</li>
              <li>Cumplimiento de licencias y requisitos regulatorios</li>
              <li>Gestión de incidentes e investigaciones de seguridad</li>
              <li>Comunicaciones laborales y notificaciones</li>
              <li>Análisis de desempeño y optimización de la fuerza laboral (mediante Trinity™ AI)</li>
              <li>Facturación y gestión financiera</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Sus Derechos de Privacidad</h2>
            <p>Usted tiene los siguientes derechos sobre sus datos personales:</p>

            <h3 className="text-xl font-semibold mb-2 mt-4">4.1 Bajo el RGPD (residentes de la UE/EEE)</h3>
            <ul>
              <li><strong>Derecho de acceso (Art. 15):</strong> Solicitar una copia de todos sus datos personales</li>
              <li><strong>Derecho de portabilidad (Art. 20):</strong> Recibir sus datos en formato estructurado (JSON)</li>
              <li><strong>Derecho de supresión (Art. 17):</strong> Solicitar la eliminación de sus datos personales</li>
              <li><strong>Derecho de rectificación (Art. 16):</strong> Corregir datos inexactos</li>
              <li><strong>Derecho de restricción (Art. 18):</strong> Limitar el procesamiento de sus datos</li>
              <li><strong>Derecho de oposición (Art. 21):</strong> Oponerse al procesamiento de sus datos</li>
            </ul>

            <h3 className="text-xl font-semibold mb-2 mt-4">4.2 Bajo la CCPA (residentes de California)</h3>
            <ul>
              <li><strong>Derecho a saber (§1798.110):</strong> Qué categorías de información personal recopilamos</li>
              <li><strong>Derecho de acceso:</strong> Acceder a su información personal específica</li>
              <li><strong>Derecho de supresión (§1798.105):</strong> Solicitar la eliminación de su información</li>
              <li><strong>Derecho a la no discriminación (§1798.125):</strong> No discriminamos por ejercer sus derechos</li>
            </ul>

            <div className="bg-muted/40 border border-border rounded-md p-4 mt-4">
              <p className="font-medium">Cómo ejercer sus derechos:</p>
              <p className="text-sm mt-1">Visite <a href="/data-subject-requests" className="underline">Solicitudes de Derechos de Datos</a> en la plataforma, o envíe un correo electrónico a privacy@coaileague.com. Las solicitudes se procesan en un plazo de 30 días.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Retención de Datos</h2>
            <p>Retenemos sus datos según los requisitos legales:</p>
            <ul>
              <li><strong>Registros de nómina e impuestos:</strong> 7 años (IRS y Ley de Empleo de Texas)</li>
              <li><strong>Registros de empleo:</strong> 7 años desde la terminación</li>
              <li><strong>Informes de incidentes:</strong> 3 años desde el cierre</li>
              <li><strong>Registros de auditoría:</strong> 7 años (cumplimiento SOX)</li>
              <li><strong>Registros de turnos:</strong> 3 años</li>
              <li><strong>Tickets de soporte:</strong> 2 años desde el cierre</li>
              <li><strong>Registros de búsqueda:</strong> 90 días</li>
            </ul>
            <p className="mt-2">Después de los períodos de retención, los datos se anonimizan de forma irreversible o se eliminan permanentemente.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Seguridad de Datos</h2>
            <ul>
              <li>Cifrado AES-256 en reposo para todos los registros de la base de datos</li>
              <li>TLS 1.3 para todos los datos en tránsito</li>
              <li>Control de acceso basado en roles (8 niveles de privilegio)</li>
              <li>Registro de auditoría de solo adición para todas las modificaciones de datos</li>
              <li>Aislamiento de datos entre espacios de trabajo (arquitectura multi-tenant)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Cookies</h2>
            <p>Usamos cookies esenciales, funcionales y de análisis. Puede gestionar sus preferencias en cualquier momento. Consulte nuestra <a href="/cookie-policy" className="underline">Política de Cookies</a> completa.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Contacto</h2>
            <p>Para preguntas sobre privacidad o para ejercer sus derechos:</p>
            <ul>
              <li>Correo electrónico: privacy@coaileague.com</li>
              <li>Plataforma: <a href="/data-subject-requests" className="underline">Solicitudes de Derechos de Datos</a></li>
              <li>Acuerdo de Procesamiento de Datos (DPA): <a href="/dpa" className="underline">/dpa</a></li>
            </ul>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
