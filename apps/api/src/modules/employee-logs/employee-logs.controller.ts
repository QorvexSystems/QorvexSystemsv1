import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { EmployeeLogsService } from './employee-logs.service';

@Controller('employee-logs')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class EmployeeLogsController {
  constructor(private readonly employeeLogsService: EmployeeLogsService) {}

  @Get()
  findRecent(@TenantId() tenantId: string) {
    return this.employeeLogsService.findRecent(tenantId);
  }
}
