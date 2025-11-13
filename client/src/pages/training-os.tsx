import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveLoading } from "@/components/responsive-loading";
import {
  GraduationCap, BookOpen, Award, Play, CheckCircle2, Clock,
  Plus, Search, Filter, TrendingUp, Users, Calendar, FileText,
  Video, Download, Upload, BarChart3, Target, Star, Trophy,
  AlertCircle, XCircle, Lock, Unlock, Settings, Edit
} from "lucide-react";

interface Course {
  id: string;
  title: string;
  description?: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: number; // hours
  isRequired: boolean;
  isCertified: boolean;
  completionRate?: number;
  enrolledCount?: number;
  status: "active" | "draft" | "archived";
}

interface Enrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  progress: number;
  status: "not_started" | "in_progress" | "completed" | "failed";
  enrolledAt: string;
  completedAt?: string;
  score?: number;
  certificateId?: string;
}

interface Certification {
  id: string;
  courseId: string;
  courseTitle: string;
  issuedAt: string;
  expiresAt?: string;
  certificateUrl?: string;
  score: number;
  status: "valid" | "expired" | "revoked";
}

export default function TrainingOS() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("catalog");

  // New course form
  const [newCourse, setNewCourse] = useState({
    title: "",
    description: "",
    category: "compliance",
    difficulty: "beginner" as "beginner" | "intermediate" | "advanced",
    duration: 1,
    isRequired: false,
    isCertified: false,
  });

  // Fetch courses catalog
  const { data: courses = [], isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ['/api/training/courses'],
    enabled: !!user,
  });

  // Fetch my enrollments
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<Enrollment[]>({
    queryKey: ['/api/training/enrollments'],
    enabled: !!user,
  });

  // Fetch my certifications
  const { data: certifications = [], isLoading: certificationsLoading } = useQuery<Certification[]>({
    queryKey: ['/api/training/certifications'],
    enabled: !!user,
  });

  // Create course mutation
  const createCourseMutation = useMutation({
    mutationFn: async (courseData: typeof newCourse) => {
      return await apiRequest('/api/training/courses', 'POST', courseData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/courses'] });
      setShowCreateDialog(false);
      setNewCourse({
        title: "",
        description: "",
        category: "compliance",
        difficulty: "beginner",
        duration: 1,
        isRequired: false,
        isCertified: false,
      });
      toast({
        title: "Course created",
        description: "Training course has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create course",
        variant: "destructive",
      });
    },
  });

  // Enroll in course mutation
  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      return await apiRequest(`/api/training/courses/${courseId}/enroll`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/enrollments'] });
      toast({
        title: "Enrolled successfully",
        description: "You can now start the course",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to enroll in course",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return <ResponsiveLoading fullScreen message="Loading TrainingOS™..." />;
  }

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || course.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(courses.map((c) => c.category)));

  const isAdmin = (user as any)?.workspaceRole === "org_owner" || (user as any)?.platformRole === "root_admin";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">TrainingOS™</h1>
              <p className="text-sm text-muted-foreground">
                Learning Management & Certification Platform
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-course">
              <Plus className="h-4 w-4 mr-2" />
              Create Course
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              Active Courses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{courses.filter((c) => c.status === "active").length}</p>
            <p className="text-xs text-muted-foreground">Available for enrollment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4 text-blue-500" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {enrollments.filter((e) => e.status === "in_progress").length}
            </p>
            <p className="text-xs text-muted-foreground">Courses you're taking</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {enrollments.filter((e) => e.status === "completed").length}
            </p>
            <p className="text-xs text-muted-foreground">Courses finished</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" />
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {certifications.filter((c) => c.status === "valid").length}
            </p>
            <p className="text-xs text-muted-foreground">Active certificates</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="catalog" data-testid="tab-catalog">
            <BookOpen className="h-4 w-4 mr-2" />
            Course Catalog
          </TabsTrigger>
          <TabsTrigger value="my-learning" data-testid="tab-my-learning">
            <Play className="h-4 w-4 mr-2" />
            My Learning
          </TabsTrigger>
          <TabsTrigger value="certifications" data-testid="tab-certifications">
            <Award className="h-4 w-4 mr-2" />
            Certifications
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Course Catalog Tab */}
        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search courses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-courses"
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {coursesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GraduationCap className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No courses found</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCourses.map((course) => {
                    const enrollment = enrollments.find((e) => e.courseId === course.id);
                    const isEnrolled = !!enrollment;

                    return (
                      <Card key={course.id} className="hover-elevate" data-testid={`course-${course.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <Badge
                              variant={course.difficulty === "beginner" ? "default" : course.difficulty === "intermediate" ? "secondary" : "destructive"}
                              className="h-5"
                            >
                              {course.difficulty}
                            </Badge>
                            {course.isRequired && (
                              <Badge variant="outline" className="h-5">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Required
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-lg line-clamp-2">{course.title}</CardTitle>
                          <CardDescription className="line-clamp-2">
                            {course.description || "No description available"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {course.duration}h
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {course.enrolledCount || 0}
                              </div>
                              {course.isCertified && (
                                <div className="flex items-center gap-1">
                                  <Award className="h-3 w-3 text-yellow-500" />
                                  Certificate
                                </div>
                              )}
                            </div>

                            {isEnrolled && enrollment.progress > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Progress</span>
                                  <span className="font-medium">{enrollment.progress}%</span>
                                </div>
                                <Progress value={enrollment.progress} className="h-2" />
                              </div>
                            )}

                            <div className="flex gap-2">
                              {isEnrolled ? (
                                <Button
                                  className="flex-1"
                                  variant={enrollment.status === "completed" ? "outline" : "default"}
                                  data-testid={`button-continue-${course.id}`}
                                >
                                  {enrollment.status === "completed" ? (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Completed
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-4 w-4 mr-2" />
                                      Continue
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  className="flex-1"
                                  onClick={() => enrollMutation.mutate(course.id)}
                                  disabled={enrollMutation.isPending}
                                  data-testid={`button-enroll-${course.id}`}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Enroll
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Learning Tab */}
        <TabsContent value="my-learning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Courses</CardTitle>
              <CardDescription>Track your learning progress</CardDescription>
            </CardHeader>
            <CardContent>
              {enrollmentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Play className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No enrollments yet</p>
                  <p className="text-sm mb-4">Start learning by enrolling in a course</p>
                  <Button onClick={() => setActiveTab("catalog")}>
                    Browse Courses
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <Card key={enrollment.id} className="hover-elevate" data-testid={`enrollment-${enrollment.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{enrollment.courseTitle}</h3>
                              <Badge
                                variant={
                                  enrollment.status === "completed"
                                    ? "default"
                                    : enrollment.status === "in_progress"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="h-5"
                              >
                                {enrollment.status === "completed" ? (
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                ) : enrollment.status === "in_progress" ? (
                                  <Play className="h-3 w-3 mr-1" />
                                ) : null}
                                {enrollment.status.replace("_", " ")}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-medium">{enrollment.progress}%</span>
                              </div>
                              <Progress value={enrollment.progress} className="h-2" />
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>
                                  Enrolled: {new Date(enrollment.enrolledAt).toLocaleDateString()}
                                </span>
                                {enrollment.completedAt && (
                                  <span>
                                    Completed: {new Date(enrollment.completedAt).toLocaleDateString()}
                                  </span>
                                )}
                                {enrollment.score !== undefined && (
                                  <span className="flex items-center gap-1">
                                    <Star className="h-3 w-3 text-yellow-500" />
                                    Score: {enrollment.score}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button size="sm" data-testid={`button-resume-${enrollment.id}`}>
                            {enrollment.status === "completed" ? "Review" : "Resume"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Certifications Tab */}
        <TabsContent value="certifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Certifications</CardTitle>
              <CardDescription>View and download your earned certificates</CardDescription>
            </CardHeader>
            <CardContent>
              {certificationsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : certifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No certifications yet</p>
                  <p className="text-sm">Complete certified courses to earn certificates</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {certifications.map((cert) => (
                    <Card key={cert.id} className="hover-elevate border-2 border-yellow-500/20" data-testid={`cert-${cert.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <Trophy className="h-8 w-8 text-yellow-500" />
                          <Badge
                            variant={cert.status === "valid" ? "default" : "destructive"}
                            className="h-5"
                          >
                            {cert.status}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg">{cert.courseTitle}</CardTitle>
                        <CardDescription>
                          <div className="space-y-1 mt-2">
                            <div className="flex items-center gap-2 text-xs">
                              <Calendar className="h-3 w-3" />
                              Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                            </div>
                            {cert.expiresAt && (
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="h-3 w-3" />
                                Expires: {new Date(cert.expiresAt).toLocaleDateString()}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-xs">
                              <Star className="h-3 w-3 text-yellow-500" />
                              Score: {cert.score}%
                            </div>
                          </div>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button className="w-full" variant="outline" data-testid={`button-download-cert-${cert.id}`}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Certificate
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Learning Analytics</CardTitle>
              <CardDescription>Track your learning performance and progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Analytics Dashboard Coming Soon</p>
                <p className="text-sm">View detailed insights about your learning journey</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Course Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-course" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>
              Add a new training course to the platform
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="course-title">Course Title *</Label>
              <Input
                id="course-title"
                placeholder="e.g., Workplace Safety & Compliance"
                value={newCourse.title}
                onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                data-testid="input-course-title"
              />
            </div>
            <div>
              <Label htmlFor="course-description">Description</Label>
              <Textarea
                id="course-description"
                placeholder="What will students learn in this course?"
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                data-testid="input-course-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="course-category">Category *</Label>
                <Select
                  value={newCourse.category}
                  onValueChange={(value) => setNewCourse({ ...newCourse, category: value })}
                >
                  <SelectTrigger id="course-category" data-testid="select-course-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="technical">Technical Skills</SelectItem>
                    <SelectItem value="soft-skills">Soft Skills</SelectItem>
                    <SelectItem value="leadership">Leadership</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="course-difficulty">Difficulty *</Label>
                <Select
                  value={newCourse.difficulty}
                  onValueChange={(value: any) => setNewCourse({ ...newCourse, difficulty: value })}
                >
                  <SelectTrigger id="course-difficulty" data-testid="select-course-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="course-duration">Duration (hours) *</Label>
              <Input
                id="course-duration"
                type="number"
                min="0.5"
                step="0.5"
                value={newCourse.duration}
                onChange={(e) => setNewCourse({ ...newCourse, duration: parseFloat(e.target.value) })}
                data-testid="input-course-duration"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCourse.isRequired}
                  onChange={(e) => setNewCourse({ ...newCourse, isRequired: e.target.checked })}
                  className="rounded"
                  data-testid="checkbox-course-required"
                />
                <span className="text-sm">Required for all employees</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCourse.isCertified}
                  onChange={(e) => setNewCourse({ ...newCourse, isCertified: e.target.checked })}
                  className="rounded"
                  data-testid="checkbox-course-certified"
                />
                <span className="text-sm">Award certificate upon completion</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createCourseMutation.mutate(newCourse)}
              disabled={!newCourse.title.trim() || createCourseMutation.isPending}
              data-testid="button-create-course-submit"
            >
              {createCourseMutation.isPending ? "Creating..." : "Create Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
