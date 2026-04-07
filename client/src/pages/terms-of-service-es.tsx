import { UniversalHeader } from "@/components/universal-header";
import { Footer } from "@/components/footer";
import { SEO } from "@/components/seo";

export default function TermsOfServiceEs() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Términos de Servicio | CoAIleague"
        description="Términos de Servicio de CoAIleague — las condiciones de uso de la plataforma de gestión de la fuerza laboral."
        canonical="https://coaileague.com/terms-es"
      />
      <UniversalHeader variant="public" />
      <div className="mx-auto max-w-4xl px-4 pt-24 pb-12 sm:px-6 lg:px-8 flex-1">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-2">Términos de Servicio</h1>
          <p className="text-muted-foreground mb-2">Versión 1.0 | Vigente: 27 de marzo de 2026</p>
          <p className="text-muted-foreground mb-8"><a href="/terms" className="underline">Read in English</a></p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Aceptación de los Términos</h2>
            <p>Al acceder o usar CoAIleague, usted acepta estar sujeto a estos Términos de Servicio. Si no está de acuerdo con alguna parte de estos términos, no puede acceder al servicio.</p>
            <p className="mt-2">CoAIleague se reserva el derecho de actualizar estos términos en cualquier momento. Los cambios materiales se notificarán a los usuarios y requerirán una nueva aceptación.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Descripción del Servicio</h2>
            <p>CoAIleague es una plataforma SaaS de gestión de la fuerza laboral diseñada para empresas de seguridad. Proporciona:</p>
            <ul>
              <li>Gestión de empleados y programación de turnos</li>
              <li>Seguimiento de tiempo y asistencia</li>
              <li>Procesamiento de nómina y gestión de cumplimiento</li>
              <li>Gestión de incidentes y reportes</li>
              <li>Gestión de relaciones con clientes</li>
              <li>Asistente de IA Trinity™ para optimización de la fuerza laboral</li>
              <li>Comunicaciones y gestión de documentos</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Cuentas de Usuario</h2>
            <p>Para usar CoAIleague, debe crear una cuenta. Usted es responsable de:</p>
            <ul>
              <li>Mantener la confidencialidad de sus credenciales de acceso</li>
              <li>Todas las actividades que ocurran bajo su cuenta</li>
              <li>Notificarnos inmediatamente de cualquier uso no autorizado</li>
              <li>Proporcionar información precisa y actualizada</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Uso Aceptable</h2>
            <p>Está prohibido usar CoAIleague para:</p>
            <ul>
              <li>Violar cualquier ley o regulación aplicable</li>
              <li>Procesar datos personales sin una base legal adecuada</li>
              <li>Acceder a datos de otras organizaciones sin autorización</li>
              <li>Intentar comprometer la seguridad de la plataforma</li>
              <li>Usar la plataforma para actividades fraudulentas</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Privacidad y Procesamiento de Datos</h2>
            <p>El procesamiento de datos personales se rige por nuestra <a href="/privacy-es" className="underline">Política de Privacidad</a> y el <a href="/dpa" className="underline">Acuerdo de Procesamiento de Datos</a>. Al usar CoAIleague, usted acepta estas políticas de privacidad.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Derechos de los Empleados</h2>
            <p>Los empleados cuyos datos son procesados a través de CoAIleague tienen derecho a:</p>
            <ul>
              <li>Acceder a sus datos personales (registros de empleo, nómina, turnos)</li>
              <li>Solicitar correcciones de datos inexactos</li>
              <li>Solicitar exportación de datos portátiles</li>
              <li>Solicitar la eliminación de datos personales (sujeto a requisitos de retención legal)</li>
            </ul>
            <p className="mt-2">Los empleados pueden ejercer estos derechos en <a href="/data-subject-requests" className="underline">Solicitudes de Derechos de Datos</a>.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Suscripción y Pagos</h2>
            <ul>
              <li>Los servicios de CoAIleague están disponibles en varios niveles de suscripción</li>
              <li>El pago es mensual o anual, procesado a través de Stripe</li>
              <li>Las cancelaciones surten efecto al final del período de facturación actual</li>
              <li>No se realizan reembolsos por períodos de suscripción no utilizados</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Propiedad Intelectual</h2>
            <p>CoAIleague y su contenido original, características y funcionalidad son propiedad exclusiva de CoAIleague LLC y están protegidos por leyes de derechos de autor, marcas comerciales y otras leyes de propiedad intelectual.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Limitación de Responsabilidad</h2>
            <p>En ningún caso CoAIleague, sus directores, empleados, socios, agentes, proveedores o afiliados serán responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Terminación</h2>
            <p>Podemos terminar o suspender su cuenta inmediatamente, sin previo aviso o responsabilidad, por cualquier motivo, incluyendo si viola los Términos. Al terminar, su derecho a usar el Servicio cesará inmediatamente.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Ley Aplicable</h2>
            <p>Estos Términos se rigen e interpretan de acuerdo con las leyes del Estado de Texas, sin tener en cuenta sus disposiciones sobre conflictos de leyes.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Contacto</h2>
            <p>Para preguntas sobre estos Términos de Servicio:</p>
            <ul>
              <li>Correo electrónico: legal@coaileague.com</li>
              <li>Solicitudes de privacidad: <a href="/data-subject-requests" className="underline">Solicitudes de Derechos de Datos</a></li>
            </ul>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
