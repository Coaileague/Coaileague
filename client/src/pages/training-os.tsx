import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DsPageWrapper, DsPageHeader, DsStatCard, DsTabBar, DsDataRow, DsSectionCard, DsBadge, DsButton, DsInput, DsEmptyState } from "@/components/ui/ds-components";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GraduationCap, BookOpen, Award, Play, CheckCircle2, Clock,
  Plus, Search, Filter, TrendingUp, Users, Calendar, FileText,
  Video, Download, Upload, BarChart3, Target, Star, Trophy,
  AlertCircle, XCircle, Lock, Unlock, Settings, Edit
} from "lucide-react";
import { CourseCardSkeleton, MetricsCardsSkeleton, PageHeaderSkeleton } from "@/components/loading-indicators/skeletons";
import { useModules } from "@/config/moduleConfig";

function TrainingAnalyticsDashboard() {
  const { data, isLoading } = useQuery<{ summary: any; courseStats: any[]; categoryBreakdown: any[] }>({
    queryKey: ['/api/training/analytics'],
  });

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading analytics...</div>;

  const s = data?.summary;
  const courses = data?.courseStats || [];
  const categories = data?.categoryBreakdown || [];

  return (
    <div className="space-y-6">
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Courses', value: s.totalCourses, icon: BookOpen },
            { label: 'Total Enrollments', value: s.totalEnrollments, icon: Users },
            { label: 'Completion Rate', value: `${s.completionRate}%`, icon: CheckCircle2 },
            { label: 'Avg Score', value: s.avgScore > 0 ? `${s.avgScore}%` : '—', icon: Star },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completion by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.category} data-testid={`analytics-category-${cat.category}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm capitalize">{cat.category}</span>
                  <span className="text-xs text-muted-foreground">{cat.completed}/{cat.enrolled} · {cat.completionRate}%</span>
                </div>
                <Progress value={cat.completionRate} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course Performance</CardTitle>
          <CardDescription>Completion rates and average scores per course</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {courses.map((course) => (
              <div key={course.id} className="rounded-md border p-3" data-testid={`analytics-course-${course.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{course.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{course.category}{course.isRequired ? ' · Required' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {course.avgScore !== null && (
                      <Badge variant="outline" className="text-xs">{course.avgScore}% avg</Badge>
                    )}
                    <Badge variant={course.completionRate >= 80 ? 'default' : course.completionRate >= 50 ? 'secondary' : 'outline'} className="text-xs">
                      {course.completionRate}%
                    </Badge>
                  </div>
                </div>
                <Progress value={course.completionRate} className="h-1.5" />
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>{course.completed} completed</span>
                  <span>{course.inProgress} in progress</span>
                  <span>{course.notStarted} not started</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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

const Icon = ({ name, className }: any) => <span className={className}>●</span>;

export default function LearningManagement() {
  const modules = useModules();
  const module = modules.getModule('learning_management');
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("catalog");

  if (!module?.enabled) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Module Not Available</CardTitle>
            <CardDescription>Learning Management is not enabled for your subscription tier</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
      return await apiRequest('POST', '/api/training/courses', courseData);
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
      return await apiRequest('POST', `/api/training/courses/${courseId}/enroll`, {});
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

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || course.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(courses.map((c) => c.category)));

  const isAdmin = (user as any)?.workspaceRole === "org_owner" || (user as any)?.platformRole === "root_admin";

  const createCourseButton = isAdmin ? (
    <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-course">
      <Plus className="h-4 w-4 mr-2" />
      Create Course
    </Button>
  ) : null;


  if (authLoading || coursesLoading) {
    return (
      <DsPageWrapper>
        <DsPageHeader title="AI Training™" subtitle="Learning Management & Certification Platform" />
        <div className="mb-6">
          <MetricsCardsSkeleton count={3} columns={3} />
        </div>
        <CourseCardSkeleton count={6} />
      </DsPageWrapper>
    );
  }

  return (
    <DsPageWrapper>

      <DsPageHeader
        title="AI Training™"
        subtitle="Learning Management & Certification Platform"
        actions={createCourseButton}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <DsStatCard
          label="Active Courses"
          value={courses.filter((c) => c.status === "active").length}
          icon={BookOpen}
          color="gold"
        />
        <DsStatCard
          label="In Progress"
          value={enrollments.filter((e) => e.status === "in_progress").length}
          icon={Play}
          color="info"
        />
        <DsStatCard
          label="Completed"
          value={enrollments.filter((e) => e.status === "completed").length}
          icon={CheckCircle2}
          color="success"
        />
        <DsStatCard
          label="Certifications"
          value={certifications.filter((c) => c.status === "valid").length}
          icon={Award}
          color="warning"
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <DsTabBar
          tabs={[
            { id: 'catalog', label: 'Course Catalog' },
            { id: 'my-learning', label: 'My Learning' },
            { id: 'certifications', label: 'Certifications' },
            { id: 'analytics', label: 'Analytics' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

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
                                <div className="flex items-center justify-between gap-1 text-xs">
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
                              <div className="flex items-center justify-between gap-1 text-xs">
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
                        <div className="flex items-start justify-between gap-2">
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
          <TrainingAnalyticsDashboard />
        </TabsContent>
      </Tabs>

      {/* Create Course Dialog */}
      <UniversalModal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <UniversalModalContent data-testid="dialog-create-course" size="xl">
          <UniversalModalHeader>
            <UniversalModalTitle>Create New Course</UniversalModalTitle>
            <UniversalModalDescription>
              Add a new training course to the platform
            </UniversalModalDescription>
          </UniversalModalHeader>
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
                  onValueChange={(value) => setNewCourse({ ...newCourse, difficulty: value })}
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
          <UniversalModalFooter>
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
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </DsPageWrapper>
  );
}
