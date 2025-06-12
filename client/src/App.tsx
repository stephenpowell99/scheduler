import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Calendar, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Scheduler from "@/pages/scheduler";
import CapacityPlanning from "@/pages/capacity-planning";
import ActivityTypeManagement from "@/pages/activity-type-management";
import StageManagement from "@/pages/stage-management";
import Login from "@/pages/login";
import UsersPage from "@/pages/users";
import NotFound from "@/pages/not-found";
import elementLogo from "@assets/Element-Header-Logo_1749214433452.webp";

function Header() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const isActive = (path: string) => location === path;
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <img 
                src={elementLogo} 
                alt="Element" 
                className="h-8"
              />
            </div>
            <nav className="hidden md:flex space-x-1">
              <Link href="/">
                <Button
                  variant={isActive("/") ? "default" : "ghost"}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    isActive("/") 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "text-gray-600 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Scheduler
                </Button>
              </Link>
              <Link href="/capacity-planning">
                <Button
                  variant={isActive("/capacity-planning") ? "default" : "ghost"}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    isActive("/capacity-planning") 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "text-gray-600 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Capacity Planning
                </Button>
              </Link>
              <Link href="/activity-types">
                <Button
                  variant={isActive("/activity-types") ? "default" : "ghost"}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    isActive("/activity-types") 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "text-gray-600 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Activity Types
                </Button>
              </Link>
              <Link href="/stages">
                <Button
                  variant={isActive("/stages") ? "default" : "ghost"}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    isActive("/stages") 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "text-gray-600 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Stages
                </Button>
              </Link>
              <Link href="/users">
                <Button
                  variant={isActive("/users") ? "default" : "ghost"}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    isActive("/users") 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "text-gray-600 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <User className="h-4 w-4 mr-2" />
                  Users
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Current Week: <strong>Week {new Date().getWeek()}, {new Date().getFullYear()}</strong>
            </span>
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">
                {user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username) : 'Loading...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// Add week number to Date prototype
declare global {
  interface Date {
    getWeek(): number;
  }
}

Date.prototype.getWeek = function() {
  const start = new Date(this.getFullYear(), 0, 1);
  const diff = this.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
};



function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthenticatedApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        <Switch>
          <Route path="/" component={Scheduler} />
          <Route path="/capacity-planning" component={CapacityPlanning} />
          <Route path="/activity-types" component={ActivityTypeManagement} />
          <Route path="/stages" component={StageManagement} />
          <Route path="/users" component={UsersPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

export default App;
