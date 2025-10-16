import { useLocation } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, hsl(243 75% 59%) 0%, hsl(264 70% 50%) 100%)'
    }}>
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" data-testid="icon-error-404" />
          </div>
          <h1 className="text-4xl font-bold" data-testid="text-error-title">404 - Page Not Found</h1>
          <p className="text-lg text-muted-foreground mt-2" data-testid="text-error-description">
            We couldn't find the page you're looking for
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            The page may have been moved, deleted, or the URL might be incorrect. Here are some helpful links to get you back on track:
          </p>

          <div className="grid gap-3 mt-6">
            <Button 
              onClick={() => setLocation("/")} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-go-home"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>

            <Button 
              onClick={() => window.history.back()} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-go-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>

            <Button 
              onClick={() => setLocation("/employees")} 
              className="w-full justify-start"
              variant="outline"
              data-testid="button-view-employees"
            >
              <Search className="mr-2 h-4 w-4" />
              View Employees
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex-col text-center space-y-2 pt-6 border-t">
          <p className="text-xs text-muted-foreground">
            Need help? <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setLocation("/support")} data-testid="link-contact-support">Contact Support</Button>
          </p>
          <p className="text-xs text-muted-foreground">
            WorkforceOS - Elite Workforce Management
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
